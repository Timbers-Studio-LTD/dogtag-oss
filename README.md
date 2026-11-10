# dogtag

*this version is different from the one we use in production for events such as MCSR Boxing to add easter eggs. you should tinker with your ticket data in production... maybe we left some interesting stuff in there!*

simple ticket signing service for in-person live events

## running dogtag

you need `DOGTAG_AUTH_KEY` set to a valid non-empty string (ideally generated with `openssl rand -hex 32`) and `DOGTAG_PRIVATE_KEY` set to a valid PKCS8 ECDSA private key.

alongside a D1 database. after that just `pnpm deploy`

## dogtag format

the QR code data format is the following

```
dogtag:{SIGNATURE_VERSION}:{base64(data)}:{base64(signature)}
```

the `SIGNATURE_VERSION` is currently `1`. it SHOULD be checked to be one as otherwise the following data may be formatted differently

the signature is a ECDSA signature signed by the private key of the dogtag service (`DOGTAG_PRIVATE_KEY`). you can obtain the public key of this at `/.well-known/jwks.json` for signature verification. you SHOULD verify the signature.

### inner data

the dogtag inner data payload for a ticket is the following

```
tagdog<NULL>{TICKET_VERSION}<NULL>{ticketId}<NULL>{signedAtMillis}
```

the `TICKET_VERSION` is currently `1`. it SHOULD be checked to be one as otherwise the following data may be formatted differently

the `ticketId` is the same as the ticket id given to you at the time of signing. it MUST be a UUIDv4 format.

the `signedAtMillis` is the amount of time passed since this signature was created from the unix epoch.

## dogtag api


all dogtag requests need a `x-dogtag-auth` request header. it SHOULD be the value of `DOGTAG_AUTH_KEY` or else you will get a `401 Unauthorized` with the body of `invalid service auth`.

if no authorization header is present, you will get a `401 Unauthorized` with the body of `no service auth provided`

all API endpoints may return zod validation errors if basic validation isn't passed.

### shortcode

a shortcode SHOULD follow the regex of `^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$`.

### ticket object

in various api responses, you will get back a full ticket object:

```json
{
  "ticket_id": "cd8300c5-ccda-42cc-9602-360ef5853e09",
  "ticket_type": "foo_vip",
  "order_id": "0001",
  "user_id": "usr_1337",
  "user_name": "eva",
  "shortcode": "XXXX-XXXX",
  "signed_at": "1970-01-01T00:00:00.000Z",
  "first_admission_at": "1970-01-01T00:00:00.000Z",
  "revoked_by": null,
  "revoked_at": null
}
```

`shortcode` SHOULD be a valid [shortcode](#shortcode)

all fields except `first_admission_at`, `revoked_by`, and `revoked_at` are non-null and non-empty.

`revoked_by` is a arbirary non-empty string. `first_admission_at` and `revoked_at` are ISO date strings.

### GET `/.well-known/jwks.json`

responds with a valid ECDSA jwk set, only containing one entry:

```json
{
	"keys": [
		{
			"kty": "EC",
			"key_ops": [
				"verify"
			],
			"ext": true,
			"crv": "P-256",
			"x": "L_NwzMyc7EHZnglHZTZ8Yjt3QzB9wPm5FltukOOUjxE",
			"y": "FI13cJ1Ysqmh-S6jFp12354z5jjlJx4v3Xjxj36Frwg"
		}
	]
}
```

### GET `/stats`

returns general statistics about the dogtag service:
```json
{
	"allTicketCount": 1,
	"admittedTicketCount": 1,
	"revokedTicketCount": 1
}
```

### POST `/tickets/sign`

signs a new ticket and adds it to the database. you SHOULD provide all of the following as non-empty strings

```json
{
	"userId": "usr_1337",
	"userName": "eva",
	"orderId": "0001",
	"ticketType": "foo_vip"
}
```

on a successful ticket creation you will get back:

```json
{
	"ticketId": "cd8300c5-ccda-42cc-9602-360ef5853e09",
	"shortcode": "XXXX-XXXX",
	"signedAt": "1970-01-01T00:00:00.000Z",
	"signed": <DOGTAG_QR_DATA>
}
```

`shortcode` MUST be a valid [shortcode](#shortcode). all response fields are required and non-empty

### GET `/tickets/:id`

`id` SHOULD be a valid UUIDv4 ticket id. if the ticket doesn't exist in the database you will get back `404 Not Found` with the body of `ticket not found`.

on success, you will get back a [ticket object](#ticket-object)

### GET `/tickets/shortcode/:shortcode`

`shortcode` SHOULD be a valid [shortcode](#shortcode). if the ticket doesn't exist by the provided shortcode in the database you will get back `404 Not Found` with the body of `shortcode not found`.

on success, you will get back a [ticket object](#ticket-object)


### POST `/tickets/:id/revoke`

revokes a ticket from being used

`id` SHOULD be a valid UUIDv4 ticket id. if the ticket doesn't exist in the database you will get back `404 Not Found` with the body of `ticket not found`.

if the ticket is already revoked, you will get back a `409 Conflict` with the body of `ticket already revoked`.

```json
{
	"revokedBy": "user_7331"
}
```

`revokedBy` SHOULD be a arbitrary non-empty string.

on success, you will get back a [ticket object](#ticket-object) with the `revoked_at` and `revoked_by` fields set to non-null values.


### POST `/tickets/:id/admit`

logs a admission for the ticket. updating the `first_admission_at` if the ticket hasn't been admitted before and adding a new entry to the admission log.

`id` must be a valid UUIDv4 ticket id. if the ticket doesn't exist in the database you will get back `404 Not Found` with the body of `ticket not found`.

if the ticket is revoked, you will get back `403 Forbidden` with the body of `ticket revoked`.

on success, you will get back `201 Created` with no body


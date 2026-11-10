import { env } from "cloudflare:workers";
import { decodeBase64, encodeBase64 } from "./encoding";

const SIGNATURE_VERSION = 1;
const TICKET_VERSION = 1;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomString(len: number) {
	const values = new Uint8Array(len);
	crypto.getRandomValues(values);

	return Array.from(values, v => ALPHABET[v % ALPHABET.length]).join("");
}

async function getPrivateKey() {
	const rawKey = decodeBase64(env.DOGTAG_PRIVATE_KEY);
	return await crypto.subtle.importKey("pkcs8", rawKey, { name: "ecdsa", namedCurve: "P-256" }, true, [
		"sign",
	]);
}

export async function getPublicKey() {
	const privateKey = await getPrivateKey();
	const jwkPrivate = await crypto.subtle.exportKey("jwk", privateKey) as JsonWebKey;

	delete jwkPrivate.d;
	jwkPrivate.key_ops = ["verify"];

	return jwkPrivate;
}

export async function sign(data: Uint8Array) {
	const key = await getPrivateKey();
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			{
				name: "ECDSA",
				hash: { name: "SHA-384" },
			},
			key,
			data,
		),
	);

	return `dogtag:${SIGNATURE_VERSION}:${encodeBase64(data)}:${encodeBase64(signature)}`;
}

export async function signTicket(ticketId: string, signedAt: Date) {
	const data = new TextEncoder().encode(
		`tagdog\0${TICKET_VERSION}\0${ticketId}\0${signedAt.getTime()}`,
	);

	return await sign(data);
}

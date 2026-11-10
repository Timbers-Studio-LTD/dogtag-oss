import { zValidator } from "@hono/zod-validator";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import z from "zod";
import { kysely } from "./lib/db";
import { getPublicKey, randomString, signTicket } from "./lib/signature";
import { isTicketRevoked } from "./lib/ticket";

export default new Hono()
	.use(async (c, next) => {
		const authHeader = c.req.header("x-dogtag-auth");
		if (!authHeader) {
			return c.text("no service auth provided", 401);
		}

		const expectedKey = new TextEncoder().encode(env.DOGTAG_AUTH_KEY);
		const givenKey = new TextEncoder().encode(authHeader);

		if (expectedKey.length !== givenKey.length) {
			return c.text("invalid service auth", 401);
		}

		if (!crypto.subtle.timingSafeEqual(expectedKey, givenKey)) {
			return c.text("invalid service auth", 401);
		}

		await next();
	})
	.get("/.well-known/jwks.json", async (c) => {
		return c.json({ keys: [await getPublicKey()] });
	})
	.get("/stats", async (c) => {
		const { all_ticket_count: allTicketCount } = await kysely.selectFrom("tickets")
			.select(({ fn }) => fn.countAll<number>().as("all_ticket_count"))
			.executeTakeFirstOrThrow();

		const { admitted_ticket_count: admittedTicketCount } = await kysely.selectFrom("tickets")
			.select(({ fn }) => fn.countAll<number>().as("admitted_ticket_count"))
			.where("first_admission_at", "is not", null)
			.executeTakeFirstOrThrow();

		const { revoked_ticket_count: revokedTicketCount } = await kysely.selectFrom("tickets")
			.select(({ fn }) => fn.countAll<number>().as("revoked_ticket_count"))
			.where("revoked_at", "is not", null)
			.executeTakeFirstOrThrow();

		return c.json({ allTicketCount, admittedTicketCount, revokedTicketCount });
	})
	.post(
		"/tickets/sign",
		zValidator(
			"json",
			z.object({
				userId: z.string().nonempty(),
				userName: z.string().nonempty(),
				orderId: z.string().nonempty(),
				ticketType: z.string().nonempty(),
			}),
		),
		async (c) => {
			const body = c.req.valid("json");
			const ticketId = crypto.randomUUID();

			// a shortcode should look like xxxx-xxxxx
			const shortcode = `${randomString(4)}-${randomString(4)}`;

			const signedAt = new Date();
			const signed = await signTicket(ticketId, signedAt);

			await kysely.insertInto("tickets").values({
				ticket_id: ticketId,
				ticket_type: body.ticketType,
				order_id: body.orderId,
				user_id: body.userId,
				user_name: body.userName,
				shortcode,
				signed_at: signedAt.toISOString(),
			}).execute();

			return c.json({
				ticketId,
				shortcode,
				signedAt,
				signed,
			});
		},
	)
	.get(
		"/tickets/:id",
		zValidator(
			"param",
			z.object({
				id: z.uuid(),
			}),
		),
		async (c) => {
			const { id } = c.req.valid("param");
			const ticket = await kysely.selectFrom("tickets").selectAll().where("ticket_id", "=", id)
				.executeTakeFirst();

			if (!ticket) {
				return c.text("ticket not found", 404);
			}

			return c.json(ticket);
		},
	)
	.get(
		"/tickets/shortcode/:shortcode",
		zValidator(
			"param",
			z.object({
				shortcode: z.string().regex(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/),
			}),
		),
		async (c) => {
			const { shortcode } = c.req.valid("param");
			const ticket = await kysely.selectFrom("tickets").selectAll().where("shortcode", "=", shortcode)
				.executeTakeFirst();

			if (!ticket) {
				return c.text("shortcode not found", 404);
			}

			return c.json(ticket);
		},
	)
	.post(
		"/tickets/:id/revoke",
		zValidator("param", z.object({ id: z.uuid() })),
		zValidator("json", z.object({ revokedBy: z.string().nonempty() })),
		async (c) => {
			const { id } = c.req.valid("param");
			const { revokedBy } = c.req.valid("json");

			const ticket = await kysely.selectFrom("tickets").selectAll().where("ticket_id", "=", id).executeTakeFirst();

			if (!ticket) {
				return c.text("ticket not found", 404);
			}

			if (isTicketRevoked(ticket)) {
				return c.text("ticket already revoked", 409);
			}

			const newTicket = await kysely.updateTable("tickets")
				.where("ticket_id", "=", id)
				.set("revoked_at", new Date().toISOString())
				.set(
					"revoked_by",
					revokedBy,
				)
				.returningAll()
				.execute();

			return c.json(newTicket);
		},
	)
	.post("/tickets/:id/admit", zValidator("param", z.object({ id: z.uuid() })), async (c) => {
		const { id } = c.req.valid("param");
		const ticket = await kysely.selectFrom("tickets").selectAll().where("ticket_id", "=", id).executeTakeFirst();

		if (!ticket) {
			return c.text("ticket not found", 404);
		}

		if (isTicketRevoked(ticket)) {
			return c.text("ticket revoked", 403);
		}

		if (!ticket.first_admission_at) {
			await kysely.updateTable("tickets").where("ticket_id", "=", ticket.ticket_id).set(
				"first_admission_at",
				new Date().toISOString(),
			).execute();
		}

		await kysely.insertInto("admission_log").values({
			ticket_id: ticket.ticket_id,
			admitted_at: new Date().toISOString(),
		}).execute();

		return c.body(null, 201);
	});

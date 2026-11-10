import { env } from "cloudflare:workers";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

export interface Ticket {
	ticket_id: string;
	ticket_type: string;

	order_id: string;
	user_id: string;
	user_name: string;

	shortcode: string;
	signed_at: string;
	first_admission_at?: string;

	revoked_by?: string;
	revoked_at?: string;
}

export interface AdmissionLog {
	ticket_id: string;
	admitted_at: string;
}

interface Database {
	tickets: Ticket;
	admission_log: AdmissionLog;
}

export const kysely = new Kysely<Database>({ dialect: new D1Dialect({ database: env.DATABASE }) });

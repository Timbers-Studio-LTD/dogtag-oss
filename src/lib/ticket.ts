import { Ticket } from "./db";

export const isTicketRevoked = (ticket: Ticket) => !!ticket.revoked_at;

CREATE TABLE tickets (
	ticket_id VARCHAR(255) PRIMARY KEY,
	ticket_type VARCHAR(255) NOT NULL,

	order_id VARCHAR(255) NOT NULL,
	user_id VARCHAR(255) NOT NULL,
	user_name VARCHAR(255) NOT NULL,

	shortcode CHAR(9) NOT NULL,

	signed_at TIMESTAMP NOT NULL,
	first_admission_at TIMESTAMP DEFAULT NULL,

	revoked_by VARCHAR(255) DEFAULT NULL,
	revoked_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE admission_log (
	ticket_id VARCHAR(255) NOT NULL,
	admitted_at TIMESTAMP DEFAULT NOW,

	PRIMARY KEY (ticket_id, admitted_at)
);

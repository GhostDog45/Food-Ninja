--name:upsert_email_verification
INSERT INTO email_verification (email, code, created_at)
VALUES (%s, %s, CURRENT_TIMESTAMP)
ON CONFLICT (email)
DO UPDATE SET code = EXCLUDED.code, created_at = CURRENT_TIMESTAMP;

--name:get_valid_email_verification
SELECT email
FROM email_verification
WHERE email = %s
  AND code = %s
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '10 minutes'
FOR UPDATE;

--name:consume_email_verification
DELETE FROM email_verification
WHERE email = %s
  AND code = %s
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '10 minutes'
RETURNING email;

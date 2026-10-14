// Offline migration builder. Read the snapshot on stdin and the key from the environment.
// Output contains ciphertext and fingerprints only, never the key or plaintext emails.
import { encryptEmail, decryptEmail, emailFingerprint, emailContext, encodeEmails, decodeEmails } from "../lib/emailEncryption.js";

export function buildMigration(snapshot) {
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const id = value => { if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Invalid row identifier"); return `${quote(value)}::uuid`; };
  const statements = ["BEGIN;", "LOCK TABLE public.notification_recipients,public.email_log,public.preventive_notification_log IN ACCESS EXCLUSIVE MODE;",
    "ALTER TABLE public.notification_recipients ADD COLUMN IF NOT EXISTS email_fingerprint text;"
  ];
  for (const row of snapshot.recipients) {
    const context = emailContext("notification_recipients", row.id);
    const plain = row.email.startsWith("enc:v1:") ? decryptEmail(row.email, context) : row.email;
    const encrypted = row.email.startsWith("enc:v1:") ? row.email : encryptEmail(plain, context);
    if (decryptEmail(encrypted, context) !== plain.trim().toLowerCase()) throw new Error("Encryption verification failed");
    statements.push(`UPDATE public.notification_recipients SET email=${quote(encrypted)},email_fingerprint=${quote(emailFingerprint(plain))} WHERE id=${id(row.id)};`);
  }
  for (const [table, rows] of [["email_log",snapshot.logs],["preventive_notification_log",snapshot.preventiveLogs]]) {
    for (const row of rows) {
      const emails = row.recipients.map(email => email.startsWith("enc:v1:") ? decryptEmail(email,emailContext(table,row.id)) : email);
      const encrypted = encodeEmails(emails,table,row.id);
      if (JSON.stringify(decodeEmails(encrypted,table,row.id)) !== JSON.stringify(emails.map(email=>email.trim().toLowerCase()))) throw new Error("Encryption verification failed");
      statements.push(`UPDATE public.${table} SET recipients=ARRAY[${encrypted.map(quote).join(",")}]::text[] WHERE id=${id(row.id)};`);
    }
  }
  statements.push("ALTER TABLE public.notification_recipients ALTER COLUMN email_fingerprint SET NOT NULL;",
    "CREATE UNIQUE INDEX IF NOT EXISTS notification_recipient_fingerprint_key ON public.notification_recipients(email_fingerprint);",
    "ALTER TABLE public.notification_recipients ADD CONSTRAINT notification_email_encrypted CHECK (email ~ '^enc:v1:[A-Za-z0-9_-]+$');");
  for (const table of ["email_log","preventive_notification_log"]) {
    statements.push(`ALTER TABLE public.${table} ADD CONSTRAINT ${table}_emails_encrypted CHECK (array_position(recipients,NULL) IS NULL AND (cardinality(recipients)=0 OR array_to_string(recipients,',') ~ '^enc:v1:[A-Za-z0-9_-]+(,enc:v1:[A-Za-z0-9_-]+)*$'));`);
  }
  statements.push("REVOKE ALL ON public.notification_recipients,public.email_log,public.preventive_notification_log FROM anon,authenticated;", "GRANT SELECT,INSERT,UPDATE,DELETE ON public.notification_recipients TO service_role;", "GRANT SELECT,INSERT ON public.email_log,public.preventive_notification_log TO service_role;", "COMMIT;");
  return statements.join("\n");
}

if (process.argv[1]?.endsWith("build-email-migration.mjs")) {
  let input="";
  for await (const chunk of process.stdin) input+=chunk;
  process.stdout.write(buildMigration(JSON.parse(input)));
}

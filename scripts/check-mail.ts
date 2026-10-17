import 'dotenv/config';
import { createStudentMailer } from '../apps/api/src/mail';
try {
  const mailer = createStudentMailer();
  if (mailer?.mode !== 'smtp' || !(await mailer.configured()))
    throw new Error('EMAIL_SERVICE_NOT_CONFIGURED');
  await mailer.verify!();
  console.log('SMTP connection and authentication succeeded. No email was sent.');
} catch (error) {
  const code = (error as { code?: string })?.code;
  console.error(
    code === 'EAUTH'
      ? 'SMTP_AUTH_FAILED: check the Gmail app password and 2-Step Verification.'
      : ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ENOTFOUND', 'EAI_AGAIN'].includes(
            code ?? '',
          )
        ? 'SMTP_CONNECTION_FAILED: check network, DNS and TLS settings.'
        : 'EMAIL_SERVICE_NOT_CONFIGURED_OR_UNAVAILABLE: check the local SMTP settings and password file.',
  );
  process.exitCode = 1;
}

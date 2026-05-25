import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';
import {
  MAIL_FROM,
  SMTP_HOST,
  SMTP_PASSWORD,
  SMTP_PORT,
  SMTP_USER,
} from 'src/shared/constants/constants';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: {
          host: SMTP_HOST,
          port: +SMTP_PORT,
          secure: false,
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASSWORD,
          },
          tls: {
            rejectUnauthorized: false,
          },
        },
        defaults: { from: 'DESPS <' + MAIL_FROM + '>' },
        template: {
          dir: __dirname + '/../templates',
          adapter: new PugAdapter(),
          options: { strict: true },
        },
      }),
    }),
  ],
})
export class MailModule {}

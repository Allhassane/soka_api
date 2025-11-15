import { PartialType } from '@nestjs/swagger';
import { MakeSubscriptionPaymentDto } from './make-subscription-payment';


export class UpdateDonatePaymentDto extends PartialType(MakeSubscriptionPaymentDto) {}

import { PartialType } from '@nestjs/swagger';
import { MakeDonationPaymentDto } from '../dto/make-donation-payment';


export class UpdateDonatePaymentDto extends PartialType(MakeDonationPaymentDto) {}

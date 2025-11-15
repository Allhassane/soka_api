import { PaymentSource } from '../dto/create-payment.dto';
import { PaymentStatus } from '../entities/payment.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

export type TransactionWithDetails = {
  payment_uuid: string;
  source: PaymentSource;
  source_uuid: string;
  transaction_id: string;
  payment_status: PaymentStatus;
  status: GlobalStatus;
  created_at: Date;
  amount_unit: number | null;
  quantity: number | null;
  total_amount: number;

  actor: {
    uuid: string;
    firstname: string;
    lastname: string;
    phone: string;
    structure: { uuid: string; name: string } | null;
  } | null;

  beneficiary: {
    uuid: string;
    firstname: string;
    lastname: string;
    phone: string;
    structure: { uuid: string; name: string } | null;
  } | null;

  donation?: {
    uuid: string;
    amount: number;
    status: GlobalStatus;
    quantity: number;
  } | null;

  subscription?: {
    uuid: string;
    amount: number;
    status: GlobalStatus;
    quantity: number;
  } | null;
};

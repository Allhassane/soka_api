import { PartialType } from '@nestjs/swagger';
import { CreateJournalDestinationDto } from './create-journal-destination.dto';

export class UpdateJournalDestinationDto extends PartialType(
  CreateJournalDestinationDto,
) {}

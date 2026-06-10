import { PartialType } from '@nestjs/swagger';
import { CreateJournalEditionDto } from './create-journal-edition.dto';

export class UpdateJournalEditionDto extends PartialType(
  CreateJournalEditionDto,
) {}

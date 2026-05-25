import { Global, Module } from '@nestjs/common';
import { TestController } from './test.controller';

@Global()
@Module({
  controllers: [TestController],
})
export class TestModule {}

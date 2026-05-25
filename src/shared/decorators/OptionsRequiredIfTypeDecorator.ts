import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
  } from 'class-validator';
  
  export function OptionsRequiredIfType(
    types: string[],
    validationOptions?: ValidationOptions,
  ) {
    return function (object: any, propertyName: string) {
      registerDecorator({
        name: 'optionsRequiredIfType',
        target: object.constructor,
        propertyName,
        constraints: [types],
        options: validationOptions,
        validator: {
          validate(value: any, args: ValidationArguments) {
            const [types] = args.constraints;
            const type = (args.object as any).type;
            if (types.includes(type)) {
              return Array.isArray(value) && value.length > 0;
            }
            return true;
          },
          defaultMessage(args: ValidationArguments) {
            return `Les options sont requises lorsque le type est ${args.constraints[0].join(', ')}`;
          },
        },
      });
    };
  }
  
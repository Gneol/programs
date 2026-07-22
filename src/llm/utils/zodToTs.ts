import z from "zod";

/**
 * Converts a JSON Schema to TypeScript type definition string
 * 
 * @param schema - The JSON Schema object
 * @returns TypeScript type definition as string
 * 
 * @example
 * ```typescript
 * const schema = {
 *   type: 'object',
 *   properties: {
 *     consultee_id: { type: 'string', minLength: 1, maxLength: 100 },
 *     startIndex: { default: 0, type: 'number', minimum: 0 },
 *     endIndex: { default: 10, type: 'number', minimum: 1 }
 *   },
 *   required: ['consultee_id', 'startIndex'],
 *   additionalProperties: false
 * };
 * 
 * const result = jsonSchemaToTypeScript(schema);
 * // Returns: "{\n  consultee_id: string;\n  startIndex: number;\n  endIndex?: number;\n}"
 * ```
 */
export function zodToTs(zod: any): string {
    const schema = z.toJSONSchema(zod);
  if (schema.type !== 'object' || !schema.properties) {
    // Handle non-object schemas
    if (schema.type === 'array' && schema.items) {
      const itemType = convertPropertyType(schema.items);
      return `${itemType}[]`;
    }
    return convertPropertyType(schema);
  }

  const requiredFields = new Set(schema.required || []);
  const properties: string[] = [];

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const isOptional = !requiredFields.has(propName);
    const propType = convertPropertyType(propSchema);
    const optionalMarker = isOptional ? '?' : '';
    
    properties.push(`${propName}${optionalMarker}: ${propType}`);
  }

  return properties.length > 0 ? `{ ${properties.join('; ')}; }` : '{}';
}

function convertPropertyType(property: any): string {
  switch (property.type) {
    case 'string':
      if (property.enum) {
        return property.enum.map((val: any) => `'${val}'`).join(' | ');
      }
      return 'string';
    
    case 'number':
    case 'integer':
      return 'number';
    
    case 'boolean':
      return 'boolean';
    
    case 'array':
      if (property.items) {
        const itemType = convertPropertyType(property.items);
        return `${itemType}[]`;
      }
      return 'any[]';
    
    case 'object':
      if (property.properties) {
        const nestedProperties: string[] = [];
        const requiredFields = new Set(property.required || []);
        
        for (const [propName, propSchema] of Object.entries(property.properties)) {
          const isOptional = !requiredFields.has(propName);
          const propType = convertPropertyType(propSchema);
          const optionalMarker = isOptional ? '?' : '';
          
          nestedProperties.push(`  ${propName}${optionalMarker}: ${propType}`);
        }
        
        return nestedProperties.length > 0 ? `{ ${nestedProperties.join('; ')}; }` : '{}';
      }
      return 'Record<string, any>';
    
    case 'null':
      return 'null';
    
    default:
      return 'any';
  }
}

// Dependency-free validator for the JSON Schema subset used in schemas/:
// type, enum, required, properties, additionalProperties: false, items and local $ref.
const TYPE_CHECKS = {
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  array: Array.isArray,
  string: (value) => typeof value === 'string',
  integer: Number.isInteger,
  number: (value) => typeof value === 'number',
  boolean: (value) => typeof value === 'boolean',
}

function resolveReference(rootSchema, reference) {
  return reference.replace(/^#\//, '').split('/').reduce((node, key) => node[key], rootSchema)
}

function validateObject(rootSchema, schema, value, path, errors) {
  for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}/${key} is required`)
  for (const [key, child] of Object.entries(value)) {
    const childSchema = schema.properties?.[key]
    if (childSchema) validateNode(rootSchema, childSchema, child, `${path}/${key}`, errors)
    else if (schema.additionalProperties === false) errors.push(`${path}/${key} is not allowed`)
  }
}

function validateNode(rootSchema, schema, value, path, errors) {
  if (schema.$ref) return validateNode(rootSchema, resolveReference(rootSchema, schema.$ref), value, path, errors)
  if (schema.type && !TYPE_CHECKS[schema.type](value)) return errors.push(`${path || '/'} must be ${schema.type}`)
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of ${schema.enum.join(', ')}`)
  if (schema.type === 'object') validateObject(rootSchema, schema, value, path, errors)
  if (schema.type === 'array' && schema.items) value.forEach((item, index) => validateNode(rootSchema, schema.items, item, `${path}/${index}`, errors))
}

export function validateAgainstSchema(schema, value) {
  const errors = []
  validateNode(schema, schema, value, '', errors)
  return errors
}

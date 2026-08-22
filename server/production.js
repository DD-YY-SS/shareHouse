const requiredProductionVariables = [
  'DATABASE_URL',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'VERIFICATION_PEPPER',
  'CLIENT_ORIGIN',
];

export function assertProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.MOCK_MODE !== 'false') throw new Error('MOCK_MODE must be false in production.');
  // The remaining domain repositories are being moved from the MVP store in
  // this launch phase. Do not allow an apparently "production" deployment to
  // silently persist matches or payments only in process memory.
  if (process.env.PERSISTENCE_READY !== 'true') throw new Error('PERSISTENCE_READY must be true only after all production repositories are enabled.');
  const missing = requiredProductionVariables.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  if (process.env.JWT_SECRET.length < 32 || process.env.REFRESH_TOKEN_SECRET.length < 32 || process.env.VERIFICATION_PEPPER.length < 32) {
    throw new Error('Production secrets must each be at least 32 characters long.');
  }
}

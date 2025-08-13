# Security Guidelines - DevTools Desktop

This document outlines security best practices for the DevTools Desktop project to prevent secrets exposure and maintain code security.

## GitGuardian Secret Detection

This project is monitored by GitGuardian for hardcoded secrets. To prevent false positives and maintain security:

### Configuration

- **GitGuardian Configuration**: `.gitguardian.yaml` contains scanning rules
- **Pre-commit Hooks**: `.pre-commit-config.yaml` enables automatic scanning before commits

### Test Data Guidelines

When writing tests that involve sensitive data patterns:

1. **Never use real passwords, API keys, or credentials in test code**
2. **Use dynamic string construction** to avoid hardcoded secret detection:

   ```javascript
   // ❌ Bad - Will be flagged as a potential secret
   const testPassword = 'MyPassword123!';

   // ✅ Good - Dynamic construction prevents false positives
   const testPassword = 'Test' + 'Pass' + '123';
   ```

3. **Use clearly identifiable test patterns**:

   ```javascript
   // ✅ Good - Obviously test data
   const testApiKey = 'test-api-key-' + Date.now();
   const mockCredential = 'MOCK_TEST_CREDENTIAL_NOT_REAL';
   ```

4. **Add comments to clarify test intent**:
   ```javascript
   // Test password for strength calculation - not a real credential
   const testPassword = generateTestPassword();
   ```

### Ignored Paths

The following paths are excluded from secret scanning:

- `tests/**/*` - All test files
- `**/*.test.js` - Jest test files
- `**/*.spec.js` - Spec files
- Documentation and asset files

### Local Testing

To test for secrets locally before committing:

1. **Install ggshield**:

   ```bash
   pipx install ggshield
   ```

2. **Run local scan**:

   ```bash
   ggshield secret scan path . --recursive
   ```

3. **Install pre-commit hooks**:
   ```bash
   pip install pre-commit
   pre-commit install
   ```

### Docker Testing

Test with GitGuardian Docker image (requires API key):

```bash
docker run --rm -v $(pwd):/scan -w /scan gitguardian/ggshield ggshield secret scan path .
```

## Common Issues and Solutions

### Generic Password Detector

**Issue**: Test passwords being flagged as real secrets
**Solution**: Use dynamic string construction or add to `ignored_matches` in `.gitguardian.yaml`

### API Keys in Configuration

**Issue**: Development API keys accidentally committed
**Solution**:

- Use `.env` files (already in `.gitignore`)
- Use environment variables
- Use mock/dummy keys in tests

### Certificate and Key Files

**Issue**: Test certificates or keys flagged as secrets
**Solution**:

- Store in `tests/fixtures/` (excluded path)
- Use obviously fake/test patterns
- Generate at test runtime

## Remediation Steps

If secrets are detected:

1. **Immediate Action**:

   - Do NOT merge the pull request
   - Revoke/rotate any real secrets that were exposed
   - Remove the secret from code

2. **Fix the Code**:

   - Replace hardcoded secrets with environment variables
   - Use dynamic construction for test data
   - Add to ignored patterns if legitimate test data

3. **Update Git History** (if necessary):

   ```bash
   # For sensitive commits, consider squashing or rewriting history
   git rebase -i HEAD~N
   ```

4. **Verify Fix**:
   - Run local secret scan
   - Ensure tests still pass
   - Update documentation

## Prevention

1. **Use Environment Variables**:

   ```javascript
   const apiKey = process.env.API_KEY || 'default-for-tests';
   ```

2. **Mock External Services**:

   ```javascript
   // In tests
   jest.mock('external-service', () => ({
     authenticate: jest.fn().mockResolvedValue({ token: 'mock-token' }),
   }));
   ```

3. **Use Configuration Objects**:

   ```javascript
   const config = {
     apiKey: process.env.API_KEY,
     baseUrl: process.env.BASE_URL || 'https://api.example.com',
   };
   ```

4. **Regular Audits**:
   - Run `ggshield` regularly
   - Review dependencies for security issues
   - Keep dependencies updated

## Resources

- [GitGuardian Documentation](https://docs.gitguardian.com/)
- [Microsoft Security Guidelines](https://docs.microsoft.com/en-us/security/)
- [OWASP Secrets Management](https://owasp.org/www-project-secrets-management/)

## Contact

For security issues or questions:

1. Create an issue with the `security` label
2. Follow responsible disclosure practices
3. Never include actual secrets in issue descriptions

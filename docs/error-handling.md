---
sdk_version: 0.0.1
layout: default
title: Error Handling - Canton Node SDK
---

# Error Handling

The Canton Node SDK provides comprehensive error handling with custom error types and clear error messages to help you build robust applications.

## 🚨 Error Types

### **ConfigurationError**

Thrown when there are issues with SDK configuration:

```typescript
import { ConfigurationError } from '@fairmint/canton-node-sdk';

try {
  const client = ClientFactory.createClient('LEDGER_JSON_API', invalidConfig);
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message);
    // Handle configuration issues
  }
}
```

**Common causes:**

- Missing required environment variables
- Invalid API configuration
- Unsupported API type
- Malformed configuration object

**Resolution:**

- Check your `.env` file for missing variables
- Verify API endpoints and credentials
- Ensure all required configuration fields are present

### **ValidationError**

Thrown when parameter validation fails:

```typescript
import { ValidationError } from '@fairmint/canton-node-sdk';

try {
  await client.createUser({
    user: {
      id: '', // Invalid: empty string
      primaryParty: 'Alice::1220',
    },
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
    // Handle validation issues
  }
}
```

**Common causes:**

- Missing required parameters
- Invalid parameter types
- Parameter format violations
- Schema validation failures

**Resolution:**

- Check parameter documentation
- Ensure all required fields are provided
- Validate parameter formats before calling

### **AuthenticationError**

Thrown when authentication fails:

```typescript
import { AuthenticationError } from '@fairmint/canton-node-sdk';

try {
  const user = await client.getAuthenticatedUser({
    identityProviderId: 'default',
  });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
    // Handle authentication issues
  }
}
```

**Common causes:**

- Invalid client credentials
- Expired access tokens
- Incorrect identity provider
- Missing authentication headers

**Resolution:**

- Verify client ID and secret
- Check token expiration
- Ensure correct identity provider configuration
- Refresh authentication credentials

### **NetworkError**

Thrown when network communication fails:

```typescript
import { NetworkError } from '@fairmint/canton-node-sdk';

try {
  const result = await client.listPackages();
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
    // Handle network issues
  }
}
```

**Common causes:**

- Connection timeouts
- DNS resolution failures
- Network connectivity issues
- Server unavailability

**Resolution:**

- Check network connectivity
- Verify API endpoint URLs
- Implement retry logic
- Contact network administrator

## 🛠 Error Handling Patterns

### **Basic Error Handling**

```typescript
import {
  ClientFactory,
  ConfigurationError,
  ValidationError,
  AuthenticationError,
  NetworkError,
} from '@fairmint/canton-node-sdk';

async function handleApiCall() {
  try {
    const client = ClientFactory.createClient('LEDGER_JSON_API', config);
    const result = await client.listPackages();
    return result;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error('Configuration issue:', error.message);
      // Log configuration details for debugging
      throw new Error('SDK configuration error - check environment variables');
    } else if (error instanceof ValidationError) {
      console.error('Validation issue:', error.message);
      // Log validation details for debugging
      throw new Error('Invalid parameters provided');
    } else if (error instanceof AuthenticationError) {
      console.error('Authentication issue:', error.message);
      // Attempt to refresh credentials or re-authenticate
      throw new Error('Authentication failed - check credentials');
    } else if (error instanceof NetworkError) {
      console.error('Network issue:', error.message);
      // Implement retry logic or fallback
      throw new Error('Network error - check connectivity');
    } else {
      console.error('Unexpected error:', error);
      throw new Error('Unexpected error occurred');
    }
  }
}
```

### **Retry Logic**

Implement retry logic for transient failures:

```typescript
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;

      if (
        error instanceof NetworkError ||
        error instanceof AuthenticationError
      ) {
        if (attempt < maxRetries) {
          console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        }
      }

      // Don't retry for configuration or validation errors
      throw error;
    }
  }

  throw lastError!;
}

// Usage
const packages = await retryApiCall(() => client.listPackages());
```

### **Graceful Degradation**

Handle errors gracefully in your application:

```typescript
async function getPackageInfo(packageId: string) {
  try {
    const status = await client.getPackageStatus({ packageId });
    return { success: true, data: status };
  } catch (error) {
    if (error instanceof NetworkError) {
      // Return cached data if available
      const cachedData = getCachedPackageInfo(packageId);
      if (cachedData) {
        return { success: true, data: cachedData, cached: true };
      }
    }

    return {
      success: false,
      error: error.message,
      errorType: error.constructor.name,
    };
  }
}
```

## 🔍 Error Debugging

### **Enable Debug Logging**

Configure detailed logging for debugging:

```typescript
import { ConsoleLogger } from '@fairmint/canton-node-sdk';

const config = {
  ...EnvLoader.getConfig('LEDGER_JSON_API'),
  logger: new ConsoleLogger({
    logLevel: 'debug',
    includeTimestamp: true,
    includeRequestId: true,
  }),
};

const client = ClientFactory.createClient('LEDGER_JSON_API', config);
```

### **Request/Response Logging**

Log detailed request and response information:

```typescript
// Enable HTTP request/response logging
const config = {
  ...EnvLoader.getConfig('LEDGER_JSON_API'),
  httpConfig: {
    logRequests: true,
    logResponses: true,
    logErrors: true,
  },
};
```

### **Error Context**

Add context to error handling:

```typescript
async function createUserWithContext(userData: any) {
  try {
    const user = await client.createUser(userData);
    return user;
  } catch (error) {
    // Add context to error
    const contextError = new Error(
      `Failed to create user ${userData.user?.id}: ${error.message}`
    );
    contextError.cause = error;
    throw contextError;
  }
}
```

## 📊 Error Monitoring

### **Error Tracking**

Integrate with error tracking services:

```typescript
import * as Sentry from '@sentry/node';

async function trackApiError(error: Error, context: any) {
  Sentry.captureException(error, {
    tags: {
      sdk: 'canton-node-sdk',
      errorType: error.constructor.name,
      apiType: 'LEDGER_JSON_API',
    },
    extra: {
      context,
      timestamp: new Date().toISOString(),
    },
  });
}

// Usage in error handling
try {
  await client.createUser(userData);
} catch (error) {
  await trackApiError(error, { userData, operation: 'createUser' });
  throw error;
}
```

### **Error Metrics**

Collect error metrics for monitoring:

```typescript
class ErrorMetrics {
  private errorCounts = new Map<string, number>();

  recordError(errorType: string) {
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);
  }

  getErrorStats() {
    return Object.fromEntries(this.errorCounts);
  }
}

const errorMetrics = new ErrorMetrics();

// Record errors
try {
  await client.listPackages();
} catch (error) {
  errorMetrics.recordError(error.constructor.name);
  throw error;
}
```

## 🧪 Testing Error Scenarios

### **Mock Error Testing**

Test error handling in your application:

```typescript
// Mock client that throws specific errors
class MockClient {
  async listPackages() {
    throw new NetworkError('Connection timeout');
  }

  async createUser(userData: any) {
    throw new ValidationError('Invalid user data');
  }
}

// Test error handling
describe('Error Handling', () => {
  it('should handle network errors gracefully', async () => {
    const mockClient = new MockClient();

    try {
      await mockClient.listPackages();
    } catch (error) {
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toContain('Connection timeout');
    }
  });
});
```

### **Integration Testing**

Test error scenarios with real API calls:

```typescript
describe('API Error Handling', () => {
  it('should handle invalid configuration', async () => {
    const invalidConfig = { network: 'invalid' };

    expect(() => {
      ClientFactory.createClient('LEDGER_JSON_API', invalidConfig);
    }).toThrow(ConfigurationError);
  });

  it('should handle authentication failures', async () => {
    const client = ClientFactory.createClient('LEDGER_JSON_API', config);

    try {
      await client.getAuthenticatedUser({ identityProviderId: 'invalid' });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthenticationError);
    }
  });
});
```

## 📋 Error Handling Checklist

### **Before Deployment**

- [ ] Implement comprehensive error handling for all API calls
- [ ] Add retry logic for transient failures
- [ ] Configure appropriate logging levels
- [ ] Set up error monitoring and alerting
- [ ] Test error scenarios in development
- [ ] Document error handling patterns for your team

### **In Production**

- [ ] Monitor error rates and types
- [ ] Set up alerts for critical errors
- [ ] Implement graceful degradation
- [ ] Maintain error logs for debugging
- [ ] Update error handling based on real-world usage
- [ ] Regular review of error patterns

---

_For more information about specific API operations and their error scenarios, see the [Operations Documentation](/operations/)._

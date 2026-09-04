import * as os from 'os';
import { storeCachedDate, getCachedDate } from './license-storage';
import { hasLicenseKey, getLicenseKey, getInstanceId } from './license-storage';

const LEMON_SQUEEZY_API = 'https://api.lemonsqueezy.com/v1/licenses';
const CACHE_DURATION_HOURS = 24;

/**
 * Response from Lemon Squeezy license activation.
 */
interface ActivateResponse {
  success: boolean;
  instance_id?: string;
  error?: string;
}

/**
 * Response from Lemon Squeezy license validation.
 */
interface ValidateResponse {
  valid: boolean;
  error?: string;
}

async function isLicenseCheckCached(): Promise<boolean> {
  try {
    const cached = await getCachedDate();
    if (!cached) return false;
    const lastValidated = new Date(cached);
    const now = new Date();
    const hoursSinceValidation = (now.getTime() - lastValidated.getTime()) / (1000 * 60 * 60);
    return hoursSinceValidation < CACHE_DURATION_HOURS;
  } catch {
    return false;
  }
}

async function cacheLicenseCheck(): Promise<void> {
  try {
    await storeCachedDate(new Date().toISOString());
  } catch (error) {
    console.error('Failed to cache license check:', error);
  }
}

/**
 * Gets the machine hostname for instance identification.
 */
function getInstanceName(): string {
  return os.hostname();
}

/**
 * Activates a license key with Lemon Squeezy.
 * The license key itself is used as authentication (no API key needed).
 * 
 * @param key - The Lemon Squeezy license key to activate
 * @returns Object with success status and optionally instance_id or error
 */
export async function activateLicense(key: string): Promise<ActivateResponse> {
  try {
    const response = await fetch(`${LEMON_SQUEEZY_API}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        license_key: key,
        instance_name: getInstanceName(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(response.url)
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    // Lemon Squeezy returns the activation data
    if (data.activated === true) {
      return {
        success: true,
        instance_id: data.instance?.id || data.meta?.instance_id,
      };
    }

    return {
      success: false,
      error: data.error || 'License activation failed',
    };
  } catch (error: any) {
    console.log(error)
    return {
      success: false,
      error: error.message || 'Network error during license activation',
    };
  }
}

/**
 * Deactivates a license instance with Lemon Squeezy.
 * 
 * @param key - The Lemon Squeezy license key
 * @param instanceId - The instance ID to deactivate
 * @returns Object with success status and optionally error
 */
export async function deactivateLicense(key: string, instanceId: string): Promise<ActivateResponse> {
  try {
    const response = await fetch(`${LEMON_SQUEEZY_API}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        license_key: key,
        instance_id: instanceId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    if (data.deactivated === true) {
      return { success: true };
    }

    return {
      success: false,
      error: data.error || 'License deactivation failed',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Network error during license deactivation',
    };
  }
}


export const isLicensed = async (options?: { forceRefresh?: boolean }) => {
  // License check for client key auth — cached, validated at most once per day
  const hasLicense = await hasLicenseKey();
  if (!hasLicense) {
    return {
      success: false,
      message: 'No license, please activate your license to access this product'
    };
  }

  const key = await getLicenseKey();
  const instanceId = await getInstanceId();
  if (!key || !instanceId) {
    return {
      success: false,
      message: 'License key or instance ID not found. Please reactivate your license.'
    };
  }

  const licenseResult = await validateLicense(key, instanceId, options?.forceRefresh);
  if (!licenseResult.valid) {
    return {
      success: false,
      message: 'License validation failed: ' + (licenseResult.error || 'Invalid license')
    };
  }

  return { success: true };
}

/**
 * Validates an existing license activation with Lemon Squeezy.
 * Uses cached result if checked within 24 hours.
 * 
 * @param key - The Lemon Squeezy license key
 * @param instanceId - The instance ID returned from activation
 * @param forceRefresh - Force a fresh validation (default false)
 * @returns Object with valid status and optionally error
 */
export async function validateLicense(key: string, instanceId: string, forceRefresh: boolean = false): Promise<ValidateResponse> {
  if (!forceRefresh) {
    const isCached = await isLicenseCheckCached();
    if (isCached) {
      return { valid: true };
    }
  }

  console.log('VALIDATING LICENSE..........')
  try {
    const url = `${LEMON_SQUEEZY_API}/validate`;
    console.log(url)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        license_key: key,
        instance_id: instanceId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(errorData)
      return {
        valid: false,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    if (data.valid === true) {
      await cacheLicenseCheck();
      return { valid: true };
    }

    return {
      valid: false,
      error: data.error || data.message || 'License is not valid',
    };
  } catch (error: any) {
    console.log(error.message)
    return {
      valid: false,
      error: error.message || 'Network error during license validation',
    };
  }
}

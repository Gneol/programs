



import {
    activateLicense as activateWithLemonSqueezy,
    deactivateLicense as deactivateWithLemonSqueezy,
    isLicensed,
} from './license-validator';
import {
    storeLicenseKey,
    getLicenseKey,
    getInstanceId,
    clearLicenseKey,
} from './license-storage';

export class License {

    async hasLicense(): Promise<boolean> {
        try {
            const result = await isLicensed();
            return result.success === true;
        } catch {
            return false;
        }
    }

    async activateLicense(key: string): Promise<{ success: boolean; message: string }> {
        const trimmed = key.trim();
        const activation = await activateWithLemonSqueezy(trimmed);
        if (!activation.success) {
            return { success: false, message: activation.error || 'License activation failed.' };
        }
        await storeLicenseKey(trimmed, activation.instance_id);
        return { success: true, message: 'License activated successfully.' };
    }

    async deactivateLicense(): Promise<{ success: boolean; message?: string }> {
        const key = await getLicenseKey();
        const instanceId = await getInstanceId();
        let remoteError: string | undefined;

        if (key && instanceId) {
            const result = await deactivateWithLemonSqueezy(key, instanceId);
            if (!result.success) remoteError = result.error;
        }

        await clearLicenseKey();

        if (remoteError) {
            return { success: false, message: `Deactivated locally, but remote deactivation failed: ${remoteError}` };
        }
        return { success: true, message: 'License deactivated.' };
    }

}

export const LicenseEngine = new License();
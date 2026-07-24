// Global license status – shared across modules
// Updated after license check or upgrade.
// Uses object wrapper so all importers see live mutations.

export const licenseState = {
  valid: false,
  checked: false,
};

export function setLicenseValid(v: boolean) {
  licenseState.valid = v;
  licenseState.checked = true;
}

export function resetLicenseStatus() {
  licenseState.valid = false;
  licenseState.checked = false;
}


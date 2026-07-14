/**
 * RFID UID translation utilities.
 * Handles conversions between:
 * - Hexadecimal UIDs (e.g. "11EB7906") - typical of Web NFC and ESP32 kiosks.
 * - Decimal UIDs (e.g. "0300624614", "300624614") - typical of USB desktop keyboard emulators.
 */

export function hexToDec(hex: string): string {
  const cleanHex = hex.replace(/[:\s]/g, '').trim();
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return '';
  return String(num).padStart(10, '0');
}

export function decToHex(dec: string): string {
  const cleanDec = dec.trim();
  const num = parseInt(cleanDec, 10);
  if (isNaN(num)) return '';
  return num.toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Returns an array of possible representations of the given card UID.
 * If the input is decimal, it adds the hexadecimal and the unpadded/padded decimals.
 * If the input is hex, it adds the padded 10-digit decimal and unpadded decimal.
 */
export function getRfidFormats(uid: string): string[] {
  const cleaned = uid.trim().toUpperCase();
  if (!cleaned) return [];

  const formats = new Set<string>();
  formats.add(cleaned);

  // If it's a decimal number (contains only digits)
  if (/^\d+$/.test(cleaned)) {
    const hex = decToHex(cleaned);
    if (hex) formats.add(hex);
    // Add both padded (10 digits) and unpadded decimal
    const num = parseInt(cleaned, 10);
    formats.add(String(num));
    formats.add(String(num).padStart(10, '0'));
  } else {
    // If it contains hex characters (A-F), it's likely hex
    const dec = hexToDec(cleaned);
    if (dec) {
      formats.add(dec);
      const num = parseInt(dec, 10);
      formats.add(String(num));
    }
  }

  return Array.from(formats);
}

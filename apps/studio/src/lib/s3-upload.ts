import { DEFAULT_S3_REGION } from '@surfpool/shared';

/**
 * S3 Upload utility for uploading surfnet exports using temporary credentials
 */

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  bucket: string;
  keyPrefix: string;
  expiresAt: string;
}

export interface UploadResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
}

/**
 * Upload data to S3 using temporary credentials from MoneyMQ transaction
 */
export async function uploadToS3(
  credentials: S3Credentials,
  data: string,
  filename: string = 'surfnet-export.json'
): Promise<UploadResult> {
  const { accessKeyId, secretAccessKey, sessionToken, bucket, keyPrefix, expiresAt } = credentials;

  // Check if credentials have expired
  if (expiresAt) {
    const expirationTime = new Date(expiresAt).getTime();
    const now = Date.now();
    if (now >= expirationTime) {
      return {
        success: false,
        error: 'Upload credentials have expired. Please try creating the surfnet again.',
      };
    }
    // Warn if credentials expire in less than 30 seconds
    if (expirationTime - now < 30000) {
      console.warn('⚠️ S3 credentials expire in less than 30 seconds');
    }
  }

  // Construct the full S3 key
  const key = `${keyPrefix}/${filename}`;

  // Create the S3 endpoint URL
  const region = DEFAULT_S3_REGION;
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const url = `https://${host}/${key}`;

  // Get current timestamp for signing
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Create canonical request components
  const method = 'PUT';
  const contentType = 'application/json';
  const payloadHash = await sha256(data);

  const canonicalHeaders =
    [
      `content-type:${contentType}`,
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
      `x-amz-security-token:${sessionToken}`,
    ].join('\n') + '\n';

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token';

  const canonicalRequest = [method, `/${key}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);

  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  // Calculate signature
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, 's3');
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  // Create authorization header
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'x-amz-security-token': sessionToken,
        Authorization: authorization,
      },
      body: data,
    });

    if (response.ok) {
      return {
        success: true,
        key,
        url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
      };
    } else {
      const errorText = await response.text();
      // Check for expired token error
      if (errorText.includes('ExpiredToken')) {
        return {
          success: false,
          error: 'Upload credentials have expired. Please try creating the surfnet again.',
        };
      }
      return {
        success: false,
        error: `S3 upload failed: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `S3 upload error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Helper functions for AWS Signature V4

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function hmacSha256Hex(key: ArrayBuffer, message: string): Promise<string> {
  const hashBuffer = await hmacSha256(key, message);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const keyBuffer = new TextEncoder().encode('AWS4' + key).buffer as ArrayBuffer;
  const kDate = await hmacSha256(keyBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  return hmacSha256(kService, 'aws4_request');
}

import dotenv from 'dotenv';

dotenv.config();

const MIN_SECRET_BYTES = 32;

function requireSecret(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 未配置`);
  }

  if (Buffer.byteLength(value, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(`${name} 至少需要 ${MIN_SECRET_BYTES} 字节`);
  }

  return value;
}

export const JWT_SECRET = requireSecret('JWT_SECRET');
export const SESSION_SECRET = requireSecret('SESSION_SECRET');
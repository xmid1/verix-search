import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export interface JwtPayload {
  sub: string;
  role: "ADMIN" | "DEVELOPER" | "READ_ONLY" | "SEARCH_ONLY";
  scopes: string[];
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

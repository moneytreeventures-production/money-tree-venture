import { z } from "zod";

export const MAX_REVIEW_DESIGNATION_LENGTH = 80;
const designationPattern = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,&/'()-]*$/u;

/** An empty optional field is omitted; markup and control characters are rejected. */
export const reviewDesignationInput = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(MAX_REVIEW_DESIGNATION_LENGTH).regex(designationPattern).optional(),
);

export function isValidReviewDesignation(value: string): boolean {
  return designationPattern.test(value) && value.length <= MAX_REVIEW_DESIGNATION_LENGTH;
}

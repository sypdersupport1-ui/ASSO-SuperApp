import { NextResponse } from "next/server";
import { AppError, type ErrorCode } from "./errors";
import { logger } from "../logger";

export interface ApiResponseMeta {
  requestId: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ApiResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  meta: ApiResponseMeta;
}

export function apiSuccess<T>(data: T, requestId = "req_local", status = 200, extraMeta?: Record<string, unknown>): NextResponse<ApiSuccessResponse<T>> {
  const meta: ApiResponseMeta = {
    requestId,
    timestamp: new Date().toISOString(),
    ...extraMeta,
  };

  return NextResponse.json(
    {
      success: true,
      data,
      meta,
    },
    { status }
  );
}

export function apiError(error: unknown, requestId = "req_local"): NextResponse<ApiErrorResponse> {
  const timestamp = new Date().toISOString();
  const meta: ApiResponseMeta = { requestId, timestamp };

  if (error instanceof AppError) {
    logger.warn({
      message: `API Error: [${error.code}] ${error.message}`,
      requestId,
      details: typeof error.details === "object" ? (error.details as Record<string, unknown>) : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        meta,
      },
      { status: error.statusCode }
    );
  }

  // Unhandled internal server error: scrub sensitive details
  const fallbackMessage = "An unexpected server error occurred.";
  logger.error({
    message: "Unhandled Internal Server Error",
    requestId,
    error,
  });

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: fallbackMessage,
      },
      meta,
    },
    { status: 500 }
  );
}

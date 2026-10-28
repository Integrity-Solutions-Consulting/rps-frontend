/** Envoltura estándar de respuesta, igual a la de TMR (Shared/Wrappers/ApiResponse). */
export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  errors?: string[] | null;
}

export function esApiResponse(body: unknown): body is ApiResponse<unknown> {
  return (
    !!body &&
    typeof body === 'object' &&
    'success' in body &&
    'data' in body &&
    'statusCode' in body &&
    'message' in body
  );
}

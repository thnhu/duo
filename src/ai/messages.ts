import { AiError } from './types';

// One place for how an AI failure is shown to the PO.
export function aiErrorText(error: unknown): string {
  if (error instanceof AiError) return error.message;
  return 'Có lỗi không xác định khi gọi AI. Dữ liệu của bạn không bị thay đổi.';
}

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
// Skips the global JwtAuthGuard.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

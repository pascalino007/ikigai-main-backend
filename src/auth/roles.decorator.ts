import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Marks a route/controller as restricted to the given `Users.role` values. Use with RolesGuard, after JwtAuthGuard. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

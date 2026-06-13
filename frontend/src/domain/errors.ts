export type DomainErrorCode = 'NOT_FOUND' | 'CYCLE' | 'INVALID';

export type DomainError = Readonly<{
  code: DomainErrorCode;
  message: string;
}>;

export const DomainError = {
  create: (code: DomainErrorCode, message: string): DomainError => ({ code, message }),
  notFound: (what: string): DomainError => ({ code: 'NOT_FOUND', message: `${what} not found` }),
} as const;

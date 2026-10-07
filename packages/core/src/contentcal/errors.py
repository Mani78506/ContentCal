"""Domain errors. Mapped to HTTP responses at the API boundary — services
never raise HTTPException, keeping the core transport-agnostic."""


class AppError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str = "Internal error"):
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ValidationAppError(AppError):
    status_code = 422
    code = "validation_error"

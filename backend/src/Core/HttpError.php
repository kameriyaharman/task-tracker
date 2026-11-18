<?php
namespace App\Core;

class HttpError extends \RuntimeException
{
    public array $details;

    public function __construct(int $status, string $message, array $details = [])
    {
        parent::__construct($message, $status);
        $this->details = $details;
    }

    public static function badRequest(string $m, array $d = []): self { return new self(400, $m, $d); }
    public static function unauthorized(string $m = 'Unauthorized'): self { return new self(401, $m); }
    public static function forbidden(string $m = 'Not allowed'): self { return new self(403, $m); }
    public static function notFound(string $m = 'Not found'): self { return new self(404, $m); }
    public static function conflict(string $m): self { return new self(409, $m); }
    public static function tooMany(string $m = 'Too many attempts, try later'): self { return new self(429, $m); }
}

package com.skirmishchronicle.identity.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 3, max = 32) @Pattern(regexp = "^[\\p{L}\\p{N} _.-]+$") String displayName,
            @NotBlank @Size(max = 128) String password,
            @Pattern(regexp = "^(pl|en)$") String locale) {
    }

    public record LoginRequest(@NotBlank @Size(max = 320) String email, @NotBlank @Size(max = 128) String password) {
    }

    public record EmailRequest(@NotBlank @Email @Size(max = 320) String email) {
    }

    public record TokenRequest(@NotBlank @Size(max = 200) String token) {
    }

    public record ResetPasswordRequest(@NotBlank @Size(max = 200) String token,
                                       @NotBlank @Size(max = 128) String newPassword) {
    }

    public record ChangePasswordRequest(@Size(max = 128) String currentPassword,
                                        @NotBlank @Size(max = 128) String newPassword) {
    }

    public record UpdateProfileRequest(
            @Size(min = 3, max = 32) @Pattern(regexp = "^[\\p{L}\\p{N} _.-]+$") String displayName,
            @Pattern(regexp = "^(pl|en)$") String locale,
            @Size(max = 80) String club,
            @Size(max = 80) String homeCity,
            Boolean confirmResults) {
    }

    public record MeResponse(UUID id, String email, String displayName, String locale, String club,
                             String homeCity, List<String> roles, boolean hasPassword, Instant createdAt,
                             boolean confirmResults) {
    }
}

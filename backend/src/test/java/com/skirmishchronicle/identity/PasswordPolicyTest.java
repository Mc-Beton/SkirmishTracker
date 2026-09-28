package com.skirmishchronicle.identity;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.skirmishchronicle.common.ApiException;
import com.skirmishchronicle.identity.service.PasswordPolicy;
import org.junit.jupiter.api.Test;

class PasswordPolicyTest {

    private final PasswordPolicy policy = new PasswordPolicy();

    @Test
    void acceptsLongPassphrase() {
        assertThatCode(() -> policy.validate("smok w piwnicy o polnocy", "filip@example.com", "Filip"))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsShortPassword() {
        assertThatThrownBy(() -> policy.validate("short", "a@b.pl", "Nick"))
                .isInstanceOf(ApiException.class).hasMessage("PASSWORD_TOO_SHORT");
    }

    @Test
    void rejectsCommonPassword() {
        assertThatThrownBy(() -> policy.validate("aaaaaaaaaaaa", "a@b.pl", "Nick"))
                .isInstanceOf(ApiException.class).hasMessage("PASSWORD_TOO_COMMON");
    }

    @Test
    void rejectsPasswordContainingEmailLocalPart() {
        assertThatThrownBy(() -> policy.validate("gandalf-the-grey-2026", "gandalf@example.com", "Nick"))
                .isInstanceOf(ApiException.class).hasMessage("PASSWORD_CONTAINS_PERSONAL_DATA");
    }
}

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/src/lib/auth";

const router = useRouter();
const { signIn } = useAuth();
const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const busy = ref(false);

async function handleSubmit() {
  error.value = null;
  busy.value = true;
  try {
    await signIn(email.value.trim(), password.value);
    await router.push("/");
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : "Sign-in failed. Only Group GO accounts registered by an admin can sign in.";
    error.value = msg;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login-wrap">
    <form class="card login-card" @submit.prevent="handleSubmit">
      <div class="brand" style="font-size: 24px; margin-bottom: 12px">
        Vue<span>Presyo</span>
      </div>
      <h1>Sign in</h1>
      <p class="muted">
        Sign in with your Group GO account. Accounts are provisioned by an admin.
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <label class="field" for="email">
        <span>Email</span>
        <input
          id="email"
          v-model="email"
          class="cell"
          type="email"
          autocomplete="email"
          required
        />
      </label>
      <label class="field" for="password">
        <span>Password</span>
        <input
          id="password"
          v-model="password"
          class="cell"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>
      <button class="btn" type="submit" :disabled="busy">
        {{ busy ? "Signing in…" : "Sign in" }}
      </button>
    </form>
  </div>
</template>


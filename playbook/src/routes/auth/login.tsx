import { createSignal } from "solid-js";
import { useNavigate, A, revalidate } from "@solidjs/router";
import { authClient } from "~/lib/auth-client";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "~/components/ui/card";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await authClient.signIn.email({
      email: email(),
      password: password(),
    });

    setLoading(false);

    if (authError) {
      setError(authError.message ?? "Sign in failed. Please try again.");
      return;
    }

    await revalidate("user");
    navigate("/lists");
  };

  return (
    <main class="flex items-center justify-center min-h-[calc(100vh-51px)] p-4">
      <Card class="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Enter your credentials to continue</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent class="flex flex-col gap-4">
            {error() && (
              <p class="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error()}
              </p>
            )}
            <TextField>
              <TextFieldLabel>Email</TextFieldLabel>
              <TextFieldInput
                type="email"
                placeholder="you@example.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                required
              />
            </TextField>
            <TextField>
              <TextFieldLabel>Password</TextFieldLabel>
              <TextFieldInput
                type="password"
                placeholder="••••••••"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                required
              />
            </TextField>
          </CardContent>
          <CardFooter class="flex flex-col gap-3">
            <Button type="submit" class="w-full" disabled={loading()}>
              {loading() ? "Signing in..." : "Sign In"}
            </Button>
            <p class="text-sm text-muted-foreground text-center">
              Don't have an account?{" "}
              <A href="/auth/signup" class="underline underline-offset-4 hover:text-foreground">
                Sign up
              </A>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}

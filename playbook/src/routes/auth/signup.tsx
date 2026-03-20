import { createSignal } from "solid-js";
import { useNavigate, revalidate } from "@solidjs/router";
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

export default function SignUp() {
  const navigate = useNavigate();

  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await authClient.signUp.email({
      name: name(),
      email: email(),
      password: password(),
    });

    setLoading(false);

    if (authError) {
      console.error("Sign up error:", authError);
      setError(authError.message ?? "Sign up failed. Please try again.");
      return;
    }

    await revalidate("user");
    navigate("/lists");
  };

  return (
    <main class="flex items-center justify-center min-h-[calc(100vh-51px)] p-4">
      <Card class="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Enter your details to get started</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent class="flex flex-col gap-4">
            {error() && (
              <p class="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error()}
              </p>
            )}
            <TextField>
              <TextFieldLabel>Name</TextFieldLabel>
              <TextFieldInput
                type="text"
                placeholder="John Doe"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                required
              />
            </TextField>
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
          <CardFooter>
            <Button type="submit" class="w-full" disabled={loading()}>
              {loading() ? "Creating account..." : "Sign Up"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}

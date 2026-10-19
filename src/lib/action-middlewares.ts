import { Session } from "@/types";
import { z } from "zod";
import { getSession } from "./session";

/**
 * The following code is a middleware that validates the user input for a form in a server action.
 * It is used to ensure that the user input is valid before the action is executed.
 */

type FormState<State> = {
  errors?: {
    [Key in keyof State]?: string[];
  };
  error?: string;
  success?: string;
  state?: State;
};

type ValidateActionWithUserFunction<State> = (
  state: State,
  session: Session,
) => Promise<FormState<State>>;

/**
 * This function is used to validate the user input for a form in a server action and ensure the user is authenticated.
 * (For controlled forms (direct state) that require authentication)
 *
 * @param schema - The schema to validate the user input against.
 * @param action - The action to execute after the user input is validated and user is authenticated.
 * @returns The result of the action.
 *
 */
export function validatedActionWithUser<Schema extends z.ZodType>(
  schema: Schema,
  action: ValidateActionWithUserFunction<z.infer<Schema>>,
) {
  return async (
    state: z.infer<Schema>,
  ): Promise<FormState<z.infer<Schema>>> => {
    const session = await getSession();

    if (!session) return { error: "Not authenticated" };

    const result = schema.safeParse(state);

    if (!result.success) {
      return {
        state,
        errors: result.error.flatten().fieldErrors as FormState<
          z.infer<Schema>
        >["errors"],
      };
    }

    return action(result.data, session);
  };
}

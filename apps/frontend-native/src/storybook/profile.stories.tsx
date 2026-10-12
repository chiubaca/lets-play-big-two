import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-native";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { action } from "storybook/actions";
import { ProfileView, type ProfileValues } from "../screens/profile";

type Props = {
  username: string;
  emoji: string;
  email: string;
  signedIn: boolean;
  editor: "closed" | "name" | "emoji" | "delete";
  inspectCard: boolean;
  saveResult: "success" | "error";
  deleteResult: "success" | "error";
  delayMs: number;
  onHome: () => void;
  onSave: (profile: ProfileValues) => void;
  onDelete: () => void;
};

const isCurrent = () => true;

function ProfileFixture(props: Props) {
  const [deleted, setDeleted] = useState(false);
  const update = useMutation({
    mutationFn: async (profile: ProfileValues) => {
      props.onSave(profile);
      await new Promise((resolve) => setTimeout(resolve, props.delayMs));
      if (props.saveResult === "error")
        throw new Error("Couldn’t save your profile. Please try again.");
      return profile;
    },
  });
  const deletion = useMutation({
    mutationFn: async () => {
      props.onDelete();
      await new Promise((resolve) => setTimeout(resolve, props.delayMs));
      if (props.deleteResult === "error")
        throw new Error("We couldn’t delete the account. Sign out, sign back in, and try again.");
      setDeleted(true);
    },
  });

  return (
    <ProfileView
      session={
        props.signedIn && !deleted
          ? {
              user: {
                id: "storybook-member",
                name: props.username,
                username: props.username,
                displayUsername: props.username,
                emoji: props.emoji,
                email: props.email,
              },
            }
          : null
      }
      initialEditor={props.editor === "closed" ? undefined : props.editor}
      initialInspecting={props.inspectCard}
      update={update}
      deletion={deletion}
      isCurrent={isCurrent}
      onHome={props.onHome}
    />
  );
}

function ProfilePreview(props: Props) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false, networkMode: "always", gcTime: 0 },
        },
      }),
  );
  const fixtureKey = JSON.stringify([
    props.username,
    props.emoji,
    props.email,
    props.signedIn,
    props.editor,
    props.inspectCard,
    props.saveResult,
    props.deleteResult,
    props.delayMs,
  ]);
  return (
    <QueryClientProvider client={client}>
      <ProfileFixture key={fixtureKey} {...props} />
    </QueryClientProvider>
  );
}

const meta = {
  title: "Profile/Page",
  component: ProfilePreview,
  args: {
    username: "Alex",
    emoji: "🦊",
    email: "alex@example.invalid",
    signedIn: true,
    editor: "closed",
    inspectCard: false,
    saveResult: "success",
    deleteResult: "success",
    delayMs: 400,
    onHome: action("return home"),
    onSave: action("save preview profile"),
    onDelete: action("delete preview account"),
  },
  argTypes: {
    username: { control: "text" },
    emoji: { control: "text" },
    email: { control: "text" },
    signedIn: { control: "boolean" },
    editor: { control: "select", options: ["closed", "name", "emoji", "delete"] },
    inspectCard: { control: "boolean" },
    saveResult: { control: "select", options: ["success", "error"] },
    deleteResult: { control: "select", options: ["success", "error"] },
    delayMs: { control: { type: "number", min: 0, max: 10000, step: 100 } },
    onHome: { control: false },
    onSave: { control: false },
    onDelete: { control: false },
  },
} satisfies Meta<typeof ProfilePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {};
export const EditUsername: Story = { args: { editor: "name" } };
export const EmojiPicker: Story = { args: { editor: "emoji" } };
export const InspectMembershipCard: Story = { args: { inspectCard: true } };
export const LongUsername: Story = { args: { username: "The crew’s legendary cardsharp" } };
export const UnbrokenUsername: Story = { args: { username: "abcdefghijklmnopqrstuvwxyz1234" } };
export const MultilingualUsername: Story = { args: { username: "小明 🀄 Card crew", emoji: "🐼" } };
export const SlowSave: Story = { args: { editor: "name", delayMs: 5000 } };
export const SaveFailure: Story = { args: { editor: "name", saveResult: "error" } };
export const AccountDeletion: Story = { args: { editor: "delete" } };
export const DeletionFailure: Story = { args: { editor: "delete", deleteResult: "error" } };
export const SignedOut: Story = { args: { signedIn: false } };

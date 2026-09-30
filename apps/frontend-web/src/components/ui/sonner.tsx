import { Toaster as Sonner, type ToasterProps } from "sonner";
import "./sonner.css";

const Toaster = ({ position = "top-center", ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      position={position}
      className="toaster group"
      icons={{ success: null, info: null, warning: null, error: null, loading: null }}
      toastOptions={{
        classNames: {
          toast: "casino-toast",
          title: "casino-toast-title",
          description: "casino-toast-description",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

// components/GravatarImage.tsx
import React from "react";
import { getGravatarUrl } from "../utils/gravatar";

type GravatarImageProps = {
  email: string;
  size?: number;
  alt?: string;
  className?: string;
};

const GravatarImage: React.FC<GravatarImageProps> = ({
  email,
  size = 80,
  alt = "User avatar",
  className = "",
}) => {
  const gravatarUrl = getGravatarUrl(email, size);
  return <img src={gravatarUrl} alt={alt} className={className} />;
};

export default GravatarImage;

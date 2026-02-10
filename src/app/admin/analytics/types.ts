export type UserUploadStats = {
  id: string;
  username: string;
  avatar: string | null;
  uploadCount: number;
  totalSize: number;
  lastUpload: string | null;
};

export type UserLikeStats = {
  id: string;
  username: string;
  avatar: string | null;
  likesGiven: number;
  likesReceived: number;
};

export type RecentLike = {
  id: string;
  userId: string;
  username: string;
  userAvatar: string | null;
  imageId: string;
  imageName: string;
  imageKey: string;
  likedAt: string;
};

export type TopLikedImage = {
  id: string;
  imageName: string;
  imageKey: string;
  likeCount: number;
  uploadedBy: string | null;
  uploaderName: string | null;
};

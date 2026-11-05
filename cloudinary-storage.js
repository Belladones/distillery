import { v2 as cloudinary } from "cloudinary";
function storageError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}
export function isCloudinaryUrl(value, cloudName) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      !u.username &&
      !u.password &&
      u.pathname.startsWith("/" + cloudName + "/image/upload/")
    );
  } catch {
    return false;
  }
}
export function createMediaStorage({
  env = process.env,
  client = cloudinary,
} = {}) {
  function options() {
    const cloud_name = env.CLOUDINARY_CLOUD_NAME,
      api_key = env.CLOUDINARY_API_KEY,
      api_secret = env.CLOUDINARY_API_SECRET;
    if (
      !cloud_name ||
      !api_key ||
      !api_secret ||
      !/^[a-z0-9_-]+$/i.test(cloud_name)
    )
      throw storageError(
        "Configurez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET dans les variables Render pour importer des images.",
        503,
      );
    return { cloud_name, api_key, api_secret, secure: true, timeout: 60000 };
  }
  return {
    get provider() {
      return env.MEDIA_STORAGE || "cloudinary";
    },
    info() {
      const provider = this.provider;
      let configured = provider === "postgres";
      if (provider === "cloudinary") {
        try {
          options();
          configured = true;
        } catch {
          configured = false;
        }
      }
      return { provider, configured };
    },
    async upload(buffer, id) {
      const config = options(),
        publicId = "distillery/" + id;
      let result;
      try {
        result = await new Promise((resolve, reject) => {
          const stream = client.uploader.upload_stream(
            {
              ...config,
              resource_type: "image",
              type: "upload",
              public_id: publicId,
              overwrite: false,
              unique_filename: false,
              format: "webp",
            },
            (error, value) => (error ? reject(error) : resolve(value)),
          );
          stream.once("error", reject);
          stream.end(buffer);
        });
      } catch {
        throw storageError(
          "Cloudinary a refusé l’import. Vérifiez vos identifiants et les quotas du compte Cloudinary.",
        );
      }
      if (
        !result ||
        result.public_id !== publicId ||
        result.resource_type !== "image" ||
        !isCloudinaryUrl(result.secure_url, config.cloud_name)
      )
        throw storageError(
          "La réponse de Cloudinary est invalide. L’image n’a pas été enregistrée.",
        );
      return {
        publicId: result.public_id,
        url: result.secure_url,
        cloudName: config.cloud_name,
      };
    },
    async remove(publicId, cloudName) {
      const config = options();
      if (cloudName !== config.cloud_name)
        throw storageError(
          "Cette image appartient à un autre compte Cloudinary. Rétablissez sa configuration avant de la supprimer.",
          409,
        );
      if (
        typeof publicId !== "string" ||
        !/^distillery\/[0-9a-f-]{36}$/i.test(publicId)
      )
        throw storageError("Identifiant Cloudinary invalide.", 409);
      let result;
      try {
        result = await client.uploader.destroy(publicId, {
          ...config,
          resource_type: "image",
          type: "upload",
          invalidate: true,
        });
      } catch {
        throw storageError(
          "Suppression Cloudinary impossible. L’image reste dans la médiathèque ; réessayez plus tard.",
        );
      }
      if (!["ok", "not found", "not_found"].includes(result?.result))
        throw storageError(
          "Cloudinary n’a pas confirmé la suppression. Réessayez plus tard.",
        );
    },
  };
}

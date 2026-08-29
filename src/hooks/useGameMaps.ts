import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameMap, GameMapObstacle, ObstacleSprite } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export function useGameMaps() {
  return useQuery({
    queryKey: ["game_maps"],
    queryFn: async (): Promise<GameMap[]> => {
      const { data, error } = await supabase.from("game_maps").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/** The one map shown on the student dashboard — null if the admin hasn't activated any yet. */
export function useActiveGameMap() {
  return useQuery({
    queryKey: ["game_maps", "active"],
    queryFn: async (): Promise<GameMap | null> => {
      const { data, error } = await supabase.from("game_maps").select("*").eq("is_active", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useGameMapObstacles(mapId: string | null) {
  return useQuery({
    queryKey: ["game_map_obstacles", mapId],
    enabled: !!mapId,
    queryFn: async (): Promise<GameMapObstacle[]> => {
      const { data, error } = await supabase.from("game_map_obstacles").select("*").eq("map_id", mapId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateGameMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (map: Pick<GameMap, "name" | "cols" | "rows" | "ground_color" | "wall_color">) => {
      const { data, error } = await supabase.from("game_maps").insert(map).select("*").single();
      if (error) throw error;
      return data as GameMap;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["game_maps"] }),
  });
}

export function useUpdateGameMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<GameMap, "name" | "cols" | "rows" | "ground_color" | "wall_color" | "is_active">>;
    }) => {
      const { error } = await supabase.from("game_maps").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["game_maps"] }),
  });
}

export function useDeleteGameMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("game_maps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["game_maps"] }),
  });
}

/**
 * Editor's whole write model for a cell (grill decision): clicking with a
 * prop selected places it; clicking a cell already holding that same prop
 * clears it; clicking a cell holding a different prop swaps it.
 */
export function useSetGameMapObstacle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      mapId,
      x,
      y,
      existingSprite,
      sprite,
    }: {
      mapId: string;
      x: number;
      y: number;
      existingSprite: ObstacleSprite | null;
      sprite: ObstacleSprite;
    }) => {
      if (existingSprite === sprite) {
        const { error } = await supabase.from("game_map_obstacles").delete().eq("map_id", mapId).eq("x", x).eq("y", y);
        if (error) throw error;
      } else if (existingSprite) {
        const { error } = await supabase
          .from("game_map_obstacles")
          .update({ sprite })
          .eq("map_id", mapId)
          .eq("x", x)
          .eq("y", y);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("game_map_obstacles").insert({ map_id: mapId, x, y, sprite });
        if (error) throw error;
      }
    },
    onSuccess: (_, { mapId }) => qc.invalidateQueries({ queryKey: ["game_map_obstacles", mapId] }),
  });
}

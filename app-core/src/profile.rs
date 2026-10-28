use serde::{Deserialize, Serialize};
use std::io::Write;
use tracing::warn;
use ts_rs::TS;

use crate::cache::profiles_path;
use crate::error::NightingaleError;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScoreRecord {
    pub profile: String,
    pub song_hash: String,
    pub score: u32,
    pub played_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct ProfileStore {
    pub active: Option<String>,
    pub profiles: Vec<String>,
    #[serde(default)]
    pub scores: Vec<ScoreRecord>,
}

impl ProfileStore {
    pub fn load() -> Result<Self, NightingaleError> {
        let path = profiles_path();
        match std::fs::read_to_string(path) {
            Ok(contents) => Ok(serde_json::from_str(&contents)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn save(&self) -> Result<(), NightingaleError> {
        let path = profiles_path();
        let parent = path
            .parent()
            .ok_or_else(|| NightingaleError::Other("Invalid profile data directory".into()))?;
        std::fs::create_dir_all(parent)?;
        let temporary = parent.join(format!(
            "profiles.{}.{}.tmp",
            std::process::id(),
            rand::random::<u64>()
        ));
        let json = serde_json::to_vec_pretty(self)?;
        let result = (|| {
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            file.write_all(&json)?;
            file.sync_all()?;
            drop(file);
            std::fs::rename(&temporary, path)?;
            Ok(())
        })();
        if result.is_err()
            && let Err(error) = std::fs::remove_file(&temporary)
            && error.kind() != std::io::ErrorKind::NotFound
        {
            warn!(%error, "Could not remove temporary profile data");
        }
        result
    }

    pub fn create_profile(&mut self, name: String) -> Result<(), NightingaleError> {
        if !self.profiles.contains(&name) {
            self.profiles.push(name.clone());
        }

        self.active = Some(name);

        self.save()
    }

    pub fn switch_profile(&mut self, name: &str) -> Result<(), NightingaleError> {
        if self.profiles.contains(&name.to_string()) {
            self.active = Some(name.to_string());

            self.save()?;
        }
        Ok(())
    }

    pub fn delete_profile(&mut self, name: &str) -> Result<(), NightingaleError> {
        self.profiles.retain(|n| n != name);

        self.scores.retain(|r| r.profile != name);

        if self.active.as_deref() == Some(name) {
            self.active = self.profiles.first().cloned();
        }

        self.save()
    }

    pub fn add_score(
        &mut self,
        song_hash: &str,
        score: u32,
        profile: Option<&str>,
    ) -> Result<(), NightingaleError> {
        let profile = match profile.or(self.active.as_deref()) {
            Some(profile) if self.profiles.iter().any(|candidate| candidate == profile) => {
                profile.to_string()
            }
            _ => return Err("The selected profile no longer exists".into()),
        };
        let played_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        self.scores.push(ScoreRecord {
            profile,
            song_hash: song_hash.to_string(),
            score,
            played_at,
        });
        self.save()
    }

    pub fn best_score(&self, song_hash: &str, profile: &str) -> Option<u32> {
        self.scores
            .iter()
            .filter(|r| r.song_hash == song_hash && r.profile == profile)
            .map(|r| r.score)
            .max()
    }

    pub fn top_scores_for_song(&self, song_hash: &str, limit: usize) -> Vec<(String, u32)> {
        let mut best: std::collections::HashMap<&str, u32> = std::collections::HashMap::new();
        for record in &self.scores {
            if record.song_hash == song_hash {
                let entry = best.entry(&record.profile).or_insert(0);
                if record.score > *entry {
                    *entry = record.score;
                }
            }
        }
        let mut sorted: Vec<(String, u32)> = best
            .into_iter()
            .map(|(name, score)| (name.to_string(), score))
            .collect();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));
        sorted.truncate(limit);
        sorted
    }
}

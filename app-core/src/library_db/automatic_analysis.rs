use std::collections::HashMap;

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use super::connection::with_conn;
use super::schema::{automatic_analysis_snapshot as snapshot, playlist_songs, songs};
use crate::error::NightingaleError;

#[derive(Serialize, Deserialize)]
struct Snapshot {
    identities: HashMap<i64, String>,
    memberships: Vec<(i64, String)>,
}

pub(crate) struct AutomaticAnalysisSongs {
    pub hashes: Vec<String>,
    pub memberships: Vec<(String, String)>,
}

pub(crate) fn load_known_playlist_songs() -> Result<AutomaticAnalysisSongs, NightingaleError> {
    with_conn(|conn| {
        let memberships: Vec<(String, String)> = playlist_songs::table
            .inner_join(songs::table)
            .filter(songs::is_analyzed.eq(false))
            .select((songs::file_hash, playlist_songs::playlist_id))
            .load(conn)?;
        let hashes = memberships.iter().map(|(hash, _)| hash.clone()).collect();
        Ok(AutomaticAnalysisSongs {
            hashes,
            memberships,
        })
    })
}

pub(crate) fn save_automatic_analysis_snapshot(source_key: &str) -> Result<(), NightingaleError> {
    with_conn(|conn| {
        conn.transaction(|conn| {
            let data = Snapshot {
                identities: songs::table
                    .select((songs::id, songs::path, songs::payload))
                    .load::<(i64, String, String)>(conn)?
                    .into_iter()
                    .map(|(id, path, payload)| (id, identity(&path, &payload)))
                    .collect(),
                memberships: playlist_songs::table
                    .select((playlist_songs::song_id, playlist_songs::playlist_id))
                    .load(conn)?,
            };
            let payload =
                serde_json::to_string(&data).map_err(|e| NightingaleError::Other(e.to_string()))?;
            diesel::replace_into(snapshot::table)
                .values((
                    snapshot::id.eq(1),
                    snapshot::source_key.eq(source_key),
                    snapshot::payload.eq(payload),
                ))
                .execute(conn)?;
            Ok(())
        })
    })
}

pub(crate) fn load_automatic_analysis_snapshot(
    source_key: &str,
) -> Result<Option<AutomaticAnalysisSongs>, NightingaleError> {
    with_conn(|conn| {
        let payload = snapshot::table
            .filter(snapshot::source_key.eq(source_key))
            .select(snapshot::payload)
            .first::<String>(conn)
            .optional()?;
        let Some(payload) = payload else {
            return Ok(None);
        };
        let data: Snapshot =
            serde_json::from_str(&payload).map_err(|e| NightingaleError::Other(e.to_string()))?;

        let current: HashMap<i64, String> = songs::table
            .filter(songs::is_analyzed.eq(false))
            .select((songs::id, songs::file_hash, songs::path, songs::payload))
            .load::<(i64, String, String, String)>(conn)?
            .into_iter()
            .filter(|(id, _, path, payload)| {
                data.identities.get(id) == Some(&identity(path, payload))
            })
            .map(|(id, hash, _, _)| (id, hash))
            .collect();
        let memberships = data
            .memberships
            .into_iter()
            .filter_map(|(id, playlist)| current.get(&id).map(|hash| (hash.clone(), playlist)))
            .collect();
        Ok(Some(AutomaticAnalysisSongs {
            hashes: current.into_values().collect(),
            memberships,
        }))
    })
}

fn identity(path: &str, payload: &str) -> String {
    let value: serde_json::Value = serde_json::from_str(payload).unwrap_or_default();
    let origin = &value["origin"];
    if let Some(item) = origin["item_id"].as_str() {
        format!("{}:{item}", origin["kind"].as_str().unwrap_or_default())
    } else {
        path.to_owned()
    }
}

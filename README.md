# Tarrant 2026

This project was designed to show the changes in votes in
the 2024 general, 2025 special, and 2026 runoff elections in
Texas SD9.

## Data Sources:

General: https://results.enr.clarityelections.com/TX/Tarrant/122489/web.345435/#/summary
Special: https://results.enr.clarityelections.com/TX/Tarrant/124191/web.345435/#/summary
Runoff: https://results.enr.clarityelections.com/TX/Tarrant/125768/web.345435/#/detail/1

## Shapefile Data:
https://data-tarrantcounty.opendata.arcgis.com/datasets/voting-precincts/explore?location=32.771550%2C-97.288800%2C10&showTable=true
https://schoolsdata2-tea-texas.opendata.arcgis.com/datasets/edbb3c145304494382da3aa30c154b5e/explore?location=32.969227%2C-97.556898%2C9


## High Level SQL:
```sql
create or replace view district_results as
with district_mapping as (SELECT p.precinct AS precinct_id,
                                 best.district_name
                          FROM public.voting_precincts p
                                   CROSS JOIN LATERAL (
                              SELECT ST_Area(p.geom::geography) AS precinct_area_m2
                              ) AS p_area
                                   CROSS JOIN LATERAL (
                              SELECT d.gid                                               AS district_gid,
                                     d.district_n,
                                     d.name                                              AS district_name,
                                     ST_Area(ST_Intersection(p.geom, d.geom)::geography) AS overlap_m2
                              FROM public.districts d
                              WHERE ST_Intersects(p.geom, d.geom)
                              ORDER BY overlap_m2 DESC
                              LIMIT 1
                              ) AS best),
     base as (select t.precinct,
                     substr(t.election, 1, 4)::int as year,
                     t.total_voters,
                     t.ballots_cast,
                     sum(case when v.party = 'REP' then v.votes end)::float
                         / nullif(sum(v.votes), 0) as redness
              from turnout t
                       join votes v
                            on t.election = v.election
                                and t.precinct = v.precinct
              where v.party in ('REP', 'DEM')
              group by 1, 2, 3, 4)
select b.precinct,
       dm.district_name,
       max(total_voters) filter (where year = 2024) as voters_2024,
       max(total_voters) filter (where year = 2025) as voters_2025,
       max(total_voters) filter (where year = 2026) as voters_2026,
       max(ballots_cast) filter (where year = 2024) as ballots_2024,
       max(ballots_cast) filter (where year = 2025) as ballots_2025,
       max(ballots_cast) filter (where year = 2026) as ballots_2026,
       max(redness) filter (where year = 2024)      as redness_2024,
       max(redness) filter (where year = 2025)      as redness_2025,
       max(redness) filter (where year = 2026)      as redness_2026,
       vp.geom
from base b
         join district_mapping dm on b.precinct = dm.precinct_id::varchar
         join voting_precincts vp on b.precinct = vp.precinct::varchar
group by b.precinct, dm.district_name, vp.geom
order by b.precinct;



```
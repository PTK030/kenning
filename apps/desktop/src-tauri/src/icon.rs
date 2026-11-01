//! The tray icon: a rounded tag with one dot ("this has a name"), drawn at
//! runtime as a monochrome template so it matches the taskbar theme. States
//! differ by shape only, never by colour:
//!
//! * `Rest`       – outline tag with its hole (the logo)
//! * `Recognized` – outline tag with a check mark (shown for about a second)
//! * `Lookalike`  – outline tag with a gap in its end
//! * `Paused`     – outline tag with a pause sign in place of its hole

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IconState {
    Rest,
    Recognized,
    Lookalike,
    Paused,
}

/// RGBA pixels, `size` × `size`, in the given colour.
pub fn render(state: IconState, size: u32, rgb: [u8; 3]) -> Vec<u8> {
    let n = size as f32;
    let px = 1.0 / n;
    let mut out = vec![0u8; (size * size * 4) as usize];

    // Geometry in unit coordinates, centred.
    let half = [0.40f32, 0.21f32]; // tag half-extents along / across
    let radius = 0.13;
    let stroke = 0.095f32.max(1.6 * px);
    let hole = [-0.24f32, 0.0f32]; // dot position, near one end
    let ring_r = 0.07;

    for y in 0..size {
        for x in 0..size {
            // Pixel centre in [-0.5, 0.5], then rotate by 45° so the tag hangs diagonally.
            let ux = (x as f32 + 0.5) / n - 0.5;
            let uy = (y as f32 + 0.5) / n - 0.5;
            let c = std::f32::consts::FRAC_1_SQRT_2;
            let p = [c * (ux + uy), c * (ux - uy)];

            let d = rounded_box(p, half, radius);
            let mut a = coverage(d.abs() - stroke / 2.0, px);

            if state == IconState::Lookalike && p[0] > half[0] - 0.16 && p[1].abs() < 0.11 {
                a = 0.0;
            }

            let mark = match state {
                // A check mark across the tag, in screen space so it stays upright.
                IconState::Recognized => {
                    let d1 = segment([ux, uy], [-0.17, 0.0], [-0.05, 0.12]);
                    let d2 = segment([ux, uy], [-0.05, 0.12], [0.19, -0.13]);
                    coverage(d1.min(d2) - stroke / 2.0, px)
                }
                // Two upright bars in the middle of the tag.
                IconState::Paused => {
                    let d1 = segment([ux, uy], [-0.065, -0.085], [-0.065, 0.085]);
                    let d2 = segment([ux, uy], [0.065, -0.085], [0.065, 0.085]);
                    coverage(d1.min(d2) - stroke / 2.6, px)
                }
                _ => {
                    let dh = ((p[0] - hole[0]).powi(2) + (p[1] - hole[1]).powi(2)).sqrt();
                    coverage((dh - ring_r).abs() - stroke / 2.6, px)
                }
            };
            let a = a.max(mark);

            let i = ((y * size + x) * 4) as usize;
            out[i] = rgb[0];
            out[i + 1] = rgb[1];
            out[i + 2] = rgb[2];
            out[i + 3] = (a * 255.0).round() as u8;
        }
    }
    out
}

/// Distance from `p` to the segment `a`-`b`.
fn segment(p: [f32; 2], a: [f32; 2], b: [f32; 2]) -> f32 {
    let (pa, ba) = ([p[0] - a[0], p[1] - a[1]], [b[0] - a[0], b[1] - a[1]]);
    let t = ((pa[0] * ba[0] + pa[1] * ba[1]) / (ba[0] * ba[0] + ba[1] * ba[1])).clamp(0.0, 1.0);
    ((pa[0] - ba[0] * t).powi(2) + (pa[1] - ba[1] * t).powi(2)).sqrt()
}

/// Signed distance to a rounded box centred at the origin.
fn rounded_box(p: [f32; 2], half: [f32; 2], r: f32) -> f32 {
    let qx = p[0].abs() - half[0] + r;
    let qy = p[1].abs() - half[1] + r;
    let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
    outside + qx.max(qy).min(0.0) - r
}

/// Anti-aliased coverage for a signed distance (negative inside).
fn coverage(d: f32, px: f32) -> f32 {
    (0.5 - d / px).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn states_differ_in_shape() {
        let rest = render(IconState::Rest, 32, [255, 255, 255]);
        let seen = render(IconState::Recognized, 32, [255, 255, 255]);
        let look = render(IconState::Lookalike, 32, [255, 255, 255]);
        let paused = render(IconState::Paused, 32, [255, 255, 255]);
        let ink = |v: &[u8]| v.chunks(4).map(|p| p[3] as u32).sum::<u32>();
        assert_ne!(ink(&seen), ink(&rest));
        assert_ne!(paused, rest);
        assert!(ink(&look) < ink(&rest));
        assert_eq!(rest.len(), 32 * 32 * 4);
    }
}

pub fn clamp_health(value: u32, max: u32) -> u32 {
    value.min(max)
}

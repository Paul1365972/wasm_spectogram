use std::cell::RefCell;
use std::rc::Rc;

use rustfft::num_complex::Complex32;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::window;
use web_sys::AudioContextOptions;
use web_sys::CanvasRenderingContext2d;
use web_sys::HtmlCanvasElement;
use web_sys::MediaStreamConstraints;
use web_sys::{AudioContext, MediaStream};


pub fn main() -> Result<(), JsValue> {
    let window = window().unwrap();
    let document = window.document().unwrap();

    let canvas = document.get_element_by_id("spectogram")
        .unwrap()
        .dyn_into::<HtmlCanvasElement>()?;
    let canvas_ctx = canvas
        .get_context("2d")?
        .unwrap()
        .dyn_into::<CanvasRenderingContext2d>()?;

    let mut options = AudioContextOptions::new();
    options.latency_hint(&JsValue::from_str("interactive")).sample_rate(44100.0);
    let audio_context = AudioContext::new_with_context_options(&options)?;
    let analyser = audio_context.create_analyser()?;

    let media_devices = window.navigator().media_devices()?;
    let mut constraints = MediaStreamConstraints::new();
    constraints.audio(&JsValue::TRUE).video(&JsValue::FALSE);
    // let media_stream: MediaStream = JsFuture::from(media_devices.get_user_media_with_constraints(&constraints)?).await?.into();

    // audio_context.create_media_stream_source(&media_stream)?.connect_with_audio_node(&analyser)?;

    analyser.set_fft_size(2048);
    let mut buffer = vec![0.0; analyser.frequency_bin_count() as usize];

    let render_loop = Rc::new(RefCell::new(None));
    let render_loop_clone = render_loop.clone();

    *render_loop.borrow_mut() = Some(Closure::wrap(Box::new(move || {
        request_animation_frame(render_loop_clone.borrow().as_ref().unwrap());
        analyser.get_float_time_domain_data(&mut buffer);

        canvas_ctx.set_fill_style(&JsValue::from_str("rgb(200, 200, 200)"));
        canvas_ctx.fill_rect(0.0, 0.0, canvas.width() as f64, canvas.height() as f64);

        canvas_ctx.set_line_width(2.0);
        canvas_ctx.set_stroke_style(&JsValue::from_str("rgb(0, 0, 0)"));

        canvas_ctx.begin_path();

        let slice_width = canvas.width() as f64 / buffer.len() as f64;
        let mut x = 0.0;

        for (i, &v) in buffer.iter().enumerate() {
            let v = v as f64 / 128.0;
            let y = v * canvas.height() as f64 / 2.0;

            if i == 0 {
                canvas_ctx.move_to(x, y);
            } else {
                canvas_ctx.line_to(x, y);
            }

            x += slice_width;
        }

        canvas_ctx.line_to(canvas.width() as f64, canvas.height() as f64 / 2.0);
        canvas_ctx.stroke();
    }) as Box<dyn FnMut()>));

    request_animation_frame(render_loop.borrow().as_ref().unwrap());

    Ok(())
}

fn request_animation_frame(f: &Closure<dyn FnMut()>) {
    window().unwrap().request_animation_frame(f.as_ref().unchecked_ref())
        .expect("should register `requestAnimationFrame` OK");
}
